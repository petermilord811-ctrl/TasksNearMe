import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/dom';

// findBy* and waitFor wait up to 3 s (default 1 s): checks often share the machine with dev servers.
configure({ asyncUtilTimeout: 3000 });
