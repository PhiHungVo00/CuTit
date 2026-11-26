import { ProfileScreen } from '@vietlearning/mfe-learner';
import { SOCIAL_ENTRY_ENABLED } from '../social/flag';

/** Route bọc mỏng để chunk lazy có tên ổn định "ProfileRoute" — tab Hồ sơ (phương án B). */
export default function ProfileRoute() {
  return <ProfileScreen messagesEnabled={SOCIAL_ENTRY_ENABLED} />;
}
