import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const root = document.getElementById('root');
if (!root) {
  document.body.innerHTML = '<div style="color:red;padding:40px;text-align:center">Root element not found</div>';
} else {
  try {
    createRoot(root).render(<App />);
  } catch (e) {
    root.innerHTML = `<div style="color:red;padding:40px;text-align:center;direction:rtl">
      <h2>حدث خطأ في تحميل التطبيق</h2>
      <pre style="margin-top:16px;font-size:13px;background:#fee;padding:16px;border-radius:8px;text-align:left">${e.message}\n\n${e.stack}</pre>
    </div>`;
  }
}
