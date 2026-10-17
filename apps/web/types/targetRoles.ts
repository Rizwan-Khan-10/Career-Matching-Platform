export interface TargetStack {
  id: string;
  label: string;
}

export interface TargetTrack {
  id: string;
  label: string;
  stacks: TargetStack[];
}

export interface TargetRoles {
  tracks: TargetTrack[];
}