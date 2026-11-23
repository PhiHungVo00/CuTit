import { MemoryRouter } from 'react-router-dom';
import { ChatScreen } from './chat/ChatScreen';

/** Chạy độc lập (pnpm dev trong package này) để phát triển màn hình mà không cần Host. */
export function App() {
  return (
    <MemoryRouter>
      <ChatScreen />
    </MemoryRouter>
  );
}
