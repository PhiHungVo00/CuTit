import { useParams } from 'react-router-dom';
import { SETTINGS_GROUPS, SettingsGroup, SettingsIndex, type SettingsGroupId } from '@vietlearning/mfe-learner';

const isGroup = (v: string | undefined): v is SettingsGroupId => !!v && (SETTINGS_GROUPS as readonly string[]).includes(v);

/** `/cai-dat` = mục lục; `/cai-dat/:nhom` = trang con. Nhóm không hợp lệ ⇒ về mục lục, không trắng màn. */
export default function SettingsRoute() {
  const { nhom } = useParams();
  return isGroup(nhom) ? <SettingsGroup id={nhom} /> : <SettingsIndex />;
}
