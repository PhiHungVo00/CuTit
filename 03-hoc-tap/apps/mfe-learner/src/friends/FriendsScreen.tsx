import { useState } from 'react';
import { CuTit } from '@vietlearning/ui';
import { ScreenFrame } from '../common/ui';
import { useT as useSettingsT } from '../settings/i18n';
import { FriendsPanel, type FriendsApi } from './FriendsPanel';

/** Màn Bạn bè (tab riêng): FriendsPanel + Cu Tít chào khi chưa có bạn nào. `api` để test tiêm bản giả. */
export function FriendsScreen({ api }: { api?: FriendsApi }) {
  const t = useSettingsT();
  const [empty, setEmpty] = useState(false);
  return (
    <ScreenFrame title={t('friendsScreenTitle')}>
      {empty && (
        <div className="flex flex-col items-center gap-2 text-center">
          <CuTit mood="chao" size={112} />
          <p className="m-0 text-[15px] text-ink-soft">{t('friendsEmpty')}</p>
        </div>
      )}
      <FriendsPanel api={api} onData={(d) => setEmpty(d.friends.length === 0)} />
    </ScreenFrame>
  );
}
