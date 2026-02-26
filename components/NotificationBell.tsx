import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { api } from '../api';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data);
      setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${(supabase.auth.getUser() as any).data?.user?.id || ''}` // Filter handled by RLS mostly, but good to be explicit if possible. Actually RLS handles SELECT, but for Realtime we often need row level security enabled on publication or filter by column.
          // Note: Supabase Realtime RLS is tricky. Usually we just listen to the table and filter in callback if needed, or rely on the fact that we only receive what we are allowed to see if "Secure Realtime" is on.
          // For simplicity here, we'll just listen to all inserts and filter by user_id in the callback if needed, or just refetch.
        },
        (payload) => {
           // Ideally check payload.new.user_id === currentUserId
           // But simpler to just refetch for now to be safe and get latest order
           fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-800 animate-pulse"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
            <h3 className="text-sm font-semibold text-white">Notifications</h3>
            <span className="text-xs text-gray-400">{unreadCount} unread</span>
          </div>
          
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {notifications.map((notification) => (
                  <div 
                    key={notification.id} 
                    className={`p-4 hover:bg-gray-700/50 transition-colors ${!notification.is_read ? 'bg-blue-900/10' : ''}`}
                    onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className={`text-sm ${!notification.is_read ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {notification.title}
                      </h4>
                      {!notification.is_read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5"></span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                      {notification.message}
                    </p>
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">
                      {new Date(notification.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
