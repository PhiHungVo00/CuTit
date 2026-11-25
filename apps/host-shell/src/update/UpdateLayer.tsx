import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { engine } from './start';
import { ForcedUpdate } from './ForcedUpdate';
import { ForcedOfflineBanner, UpdatePrompt } from './UpdatePrompt';

/**
 * Lớp giao diện cập nhật gắn trong App (chunk lười, chỉ bản production). Cho engine biết route hiện tại
 * (để không hiện giữa bài học) rồi vẽ đúng MỘT thứ: màn bắt buộc > dải offline > thẻ nhắc.
 */
export default function UpdateLayer() {
  const view = useSyncExternalStore(engine.subscribe, engine.getView);
  const { pathname } = useLocation();
  useEffect(() => engine.setPath(pathname), [pathname]);

  if (view.forced) return <ForcedUpdate onUpdate={() => void engine.runForced()} errorKey={view.error} />;
  return (
    <>
      {view.forcedOffline && <ForcedOfflineBanner />}
      {view.ready ? (
        <UpdatePrompt kind="ready" onPrimary={() => void view.ready?.()} />
      ) : view.progress !== null ? (
        <UpdatePrompt kind="downloading" percent={view.progress} />
      ) : view.error ? (
        <UpdatePrompt kind="error" errorKey={view.error} onLater={engine.dismissError} />
      ) : view.webReload ? (
        <UpdatePrompt kind="webReload" onPrimary={() => void engine.runSoft()} onLater={engine.dismissWebRefresh} />
      ) : view.soft ? (
        <UpdatePrompt
          kind="soft"
          version={view.soft.latestVersion}
          notes={view.soft.notes}
          onPrimary={() => void engine.runSoft()}
          onLater={engine.snooze}
        />
      ) : null}
    </>
  );
}
