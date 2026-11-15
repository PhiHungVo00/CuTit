import { MemoryRouter } from 'react-router-dom';
import { CameraScreen } from './camera/CameraScreen';

/** Chạy độc lập (pnpm dev trong package này) để phát triển màn hình mà không cần Host. */
export function App() {
  return (
    <MemoryRouter>
      <CameraScreen />
    </MemoryRouter>
  );
}
