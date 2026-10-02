import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// Preserve the original plugin form and two-page print appearance.
import './original-plugin-design.css';
import './declaration-preview-original.css';

const mountNodes = Array.from(
  document.querySelectorAll<HTMLElement>('[data-cokifimi-root="true"], #cokifimi-formulario-root, #root'),
);

const uniqueMountNodes = mountNodes.filter((element, index, list) => list.indexOf(element) === index);

uniqueMountNodes.forEach((mountNode) => {
  const mode = (mountNode.getAttribute('data-cokifimi-mode') || window.cokifimiSettings?.mode || 'public') as
    | 'public'
    | 'wp-admin'
    | 'portal'
    | 'member'
    | 'member-register'
    | 'member-no-token';

  createRoot(mountNode).render(
    <StrictMode>
      <App mode={mode} />
    </StrictMode>,
  );
});
