import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import useNotificationStore from '../store/notifications'
import { Check, X } from 'lucide-react'

interface NotificationButtonProps {
  onApprove: (requester: string, amount: number) => void;
  currentUser: string;
}

export const NotificationButton: React.FC<NotificationButtonProps> = ({ onApprove, currentUser }) => {
  const [isOpen, setIsOpen] = useState(false)
  const { notifications, updateNotificationStatus, removeNotification } = useNotificationStore()
  
  // Filter notifications based on current user
  const relevantNotifications = notifications.filter(n => 
    currentUser === 'Mhlengi Mntungwa' 
      ? n.status === 'pending'  // Show only pending for Mhlengi
      : n.requester === currentUser // Show all for the requester
  )
  
  const pendingCount = notifications.filter(n => 
    currentUser === 'Mhlengi Mntungwa' 
      ? n.status === 'pending' 
      : n.status === 'pending' && n.requester === currentUser
  ).length

  const handleApprove = (notification: any) => {
    onApprove(notification.requester, notification.amount);
    updateNotificationStatus(notification.id, 'approved', 'Mhlengi Mntungwa');
  };

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      month: 'short',
      day: 'numeric'
    }).format(new Date(date));
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        className="relative w-10 h-10 flex items-center justify-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {pendingCount > 0 && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
        )}
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-[380px] bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-medium text-gray-900">Notifications</h3>
            </div>
            
            <div className="max-h-[400px] overflow-y-auto">
              {relevantNotifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {relevantNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-3 rounded-lg transition-colors ${
                        notification.status === 'pending'
                          ? 'bg-white hover:bg-gray-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {currentUser === 'Mhlengi Mntungwa' ? notification.requester : 'Your Request'}
                            </p>
                            <Badge
                              variant="default"
                              className={`${
                                notification.status === 'approved'
                                  ? 'bg-green-50 text-green-700'
                                  : notification.status === 'rejected'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-blue-50 text-blue-700'
                              }`}
                            >
                              {notification.status === 'approved' ? 'Approved' : 
                               notification.status === 'rejected' ? 'Rejected' : 'Pending'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {notification.department} • {formatTimestamp(notification.timestamp)}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-sm font-medium text-gray-900">
                              {notification.amount.toLocaleString()} points
                            </span>
                            {notification.status === 'approved' && (
                              <div className="flex items-center gap-1 text-sm text-gray-500">
                                <span>•</span>
                                <span>Approved by {notification.approver}</span>
                                <span>•</span>
                                <span>{formatTimestamp(notification.approvalTimestamp!)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {currentUser === 'Mhlengi Mntungwa' && notification.status === 'pending' && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-red-500 hover:bg-red-50"
                              onClick={() => updateNotificationStatus(notification.id, 'rejected', currentUser)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-gray-500 hover:text-green-500 hover:bg-green-50"
                              onClick={() => handleApprove(notification)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
} 