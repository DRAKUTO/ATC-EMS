import Navbar from '../components/Navbar';

export default function Home() {
  return (
    <div className="relative min-h-screen">
      <Navbar />
      <div style={{ padding: '100px 40px 40px', textAlign: 'center', direction: 'rtl' }}>
        <h1 className="text-4xl font-bold gradient-text mb-4">LOS SANTOS HOSPITAL CENTRAL</h1>
        <p className="text-dark-500">جاري تحميل الموقع...</p>
      </div>
    </div>
  );
}
