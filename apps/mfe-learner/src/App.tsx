import { MemoryRouter } from 'react-router-dom';
import { OnboardingScreen } from './onboarding/OnboardingScreen';

/** Chạy độc lập (pnpm dev trong package này) để phát triển màn hình mà không cần Host. */
export function App() {
  return (
    <MemoryRouter>
      <OnboardingScreen />
    </MemoryRouter>
  );
}
