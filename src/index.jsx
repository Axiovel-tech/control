import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';

import { disableReactDevTools } from '@fvilers/disable-react-devtools';
import { createRoot } from 'react-dom/client';

import { maybeInstallE2EBridge } from './e2e';
import './i18n';
import AppWithSplashScreen from './splash';

// Disable React dev tools in production
if (process.env.NODE_ENV === 'production') {
  disableReactDevTools();
}

// Expose the automation bridge when this bundle was built with AXIO_E2E=1.
// Compiled out entirely otherwise.
maybeInstallE2EBridge();

// Render the application
const container = document.querySelector('#root');
const root = createRoot(container);
root.render(<AppWithSplashScreen />);
