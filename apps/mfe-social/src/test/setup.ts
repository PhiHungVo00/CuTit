import { beforeEach } from 'vitest';
import { learnerStore } from '@vietlearning/state';

// Mọi test mặc định tiếng Việt (test song ngữ tự đổi sang en)
beforeEach(() => learnerStore.getState().setPreferences({ uiLanguage: 'vi' }));
