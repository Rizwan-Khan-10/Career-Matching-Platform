// contract 5.3 / 4.8. Named AppNotification so it never clashes with the browser's Notification class.
export interface AppNotification {
  id: string;
  type: string; // contract 7: resume_ready, match_eligible, feedback_ready, candidate_ready, shortlisted, prep_ready, rejected, ...
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

// contract 6: websocket event "notification.created"
export interface NotificationCreatedEvent {
  userId: string;
  notification: AppNotification;
}