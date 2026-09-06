import { create } from 'zustand'

export interface Notification {
  id: string
  requester: string
  department: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  timestamp: Date
  approver?: string
  approvalTimestamp?: Date
}

interface NotificationStore {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id' | 'status' | 'timestamp'>) => void
  updateNotificationStatus: (id: string, status: 'approved' | 'rejected', approver?: string) => void
  removeNotification: (id: string) => void
}

const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  
  addNotification: (notification) => set((state) => ({
    notifications: [
      ...state.notifications,
      {
        ...notification,
        id: crypto.randomUUID(),
        status: 'pending',
        timestamp: new Date()
      }
    ]
  })),

  updateNotificationStatus: (id, status, approver) => set((state) => ({
    notifications: state.notifications.map((notification) =>
      notification.id === id 
        ? { 
            ...notification, 
            status,
            approver: status === 'approved' ? approver : undefined,
            approvalTimestamp: status === 'approved' ? new Date() : undefined
          } 
        : notification
    )
  })),

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter((notification) => notification.id !== id)
  })),
}))

export default useNotificationStore