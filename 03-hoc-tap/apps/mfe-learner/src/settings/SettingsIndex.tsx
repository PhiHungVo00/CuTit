import type { ComponentType, MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListRow } from '@vietlearning/ui';
import { ScreenFrame, linkBtn } from '../common/ui';
import { AmThanh } from './groups/AmThanh';
import { ChuyenDong } from './groups/ChuyenDong';
import { GiaoDien } from './groups/GiaoDien';
import { Hoc } from './groups/Hoc';
import { NgonNgu } from './groups/NgonNgu';
import { QuyenRiengTu } from './groups/QuyenRiengTu';
import { TaiKhoan } from './groups/TaiKhoan';
import { GROUP_ICON, SETTINGS_GROUPS, type SettingsGroupId } from './groups';
import { Rows } from './parts';
import { useT } from './i18n';

export type { SettingsGroupId };

/** Mục lục Cài đặt (phương án B): 7 nhóm, chạm vào mở trang con /cai-dat/:nhom */
export function SettingsIndex() {
  const t = useT();
  const navigate = useNavigate();
  const go = (to: string) => (e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    navigate(to);
  };
  return (
    <ScreenFrame title={t('settingsTitle')}>
      <Rows>
        {SETTINGS_GROUPS.map((id) => (
          <ListRow key={id} icon={GROUP_ICON[id]} label={t(`group.${id}`)} hint={t(`group.${id}.hint`)} to={`/cai-dat/${id}`} onClick={go(`/cai-dat/${id}`)} />
        ))}
      </Rows>
    </ScreenFrame>
  );
}

const BODY: Record<SettingsGroupId, ComponentType> = {
  'giao-dien': GiaoDien,
  'ngon-ngu': NgonNgu,
  hoc: Hoc,
  'am-thanh': AmThanh,
  'chuyen-dong': ChuyenDong,
  'quyen-rieng-tu': QuyenRiengTu,
  'tai-khoan': TaiKhoan
};

/** Trang con của một nhóm (route /cai-dat/:nhom). Id lạ ⇒ báo không có nhóm, không trắng màn. */
export function SettingsGroup({ id }: { id: SettingsGroupId }) {
  const t = useT();
  const Body = BODY[id];
  const back = (
    <Link to="/cai-dat" className={linkBtn}>
      {t('settingsBack')}
    </Link>
  );
  if (!Body) {
    return (
      <ScreenFrame title={t('settingsTitle')} action={back}>
        <p className="m-0 text-[15px] text-ink-soft">{t('unknownGroup')}</p>
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame title={t(`group.${id}`)} action={back}>
      <Body />
    </ScreenFrame>
  );
}

/** Tương thích route cũ /tuy-chinh: xếp mọi nhóm trong một trang (host sẽ chuyển hướng sang /cai-dat khi nối xong). */
export function PreferencesScreen() {
  const t = useT();
  return (
    <ScreenFrame title={t('settingsTitle')}>
      {SETTINGS_GROUPS.map((id) => {
        const Body = BODY[id];
        return (
          <section key={id} aria-label={t(`group.${id}`)} className="flex flex-col gap-4">
            <h2 className="m-0 text-lg font-extrabold text-heading">{t(`group.${id}`)}</h2>
            <Body />
          </section>
        );
      })}
    </ScreenFrame>
  );
}
