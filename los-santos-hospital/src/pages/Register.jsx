import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { FaHeartbeat, FaUser, FaEnvelope, FaLock, FaPhone, FaUserPlus, FaEye, FaEyeSlash } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('كلمات المرور غير متطابقة');
      return;
    }
    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const result = register({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      });
      if (result.success) {
        navigate('/login');
      } else {
        setError(result.error);
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 py-20 px-4">
      <div className="absolute inset-0">
        <div className="absolute top-20 right-20 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-80 h-80 bg-accent-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl gradient-bg flex items-center justify-center">
              <FaHeartbeat className="text-white text-xl" />
            </div>
          </Link>
          <h2 className="text-3xl font-bold text-dark-900 dark:text-white">إنشاء حساب جديد</h2>
          <p className="text-dark-500 dark:text-dark-400 mt-2">انضم إلينا للاستفادة من خدماتنا المميزة</p>
        </div>

        <div className="p-8 rounded-3xl bg-white dark:bg-dark-800/70 backdrop-blur-xl border border-gray-100 dark:border-dark-700/50 shadow-2xl">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm text-center mb-6"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">الاسم الكامل</label>
              <div className="relative">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaUser /></div>
                <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="أدخل اسمك الكامل" required className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">البريد الإلكتروني</label>
              <div className="relative">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaEnvelope /></div>
                <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="أدخل بريدك الإلكتروني" required className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">رقم الهاتف</label>
              <div className="relative">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaPhone /></div>
                <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="أدخل رقم هاتفك" required className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">كلمة المرور</label>
              <div className="relative">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaLock /></div>
                <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleChange} placeholder="أدخل كلمة المرور" required className="w-full pr-12 pl-12 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-dark-600">
                  {showPassword ? <FaEyeSlash /> : <FaEye />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">تأكيد كلمة المرور</label>
              <div className="relative">
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaLock /></div>
                <input type={showPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} placeholder="أعد إدخال كلمة المرور" required className="w-full pr-12 pl-12 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-2xl gradient-bg text-white font-bold text-lg flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-primary-500/30 transition-all disabled:opacity-60">
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <><FaUserPlus /><span>إنشاء الحساب</span></>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-dark-500 dark:text-dark-400 text-sm">
              لديك حساب بالفعل؟{' '}
              <Link to="/login" className="text-primary-600 dark:text-primary-400 font-semibold hover:underline">تسجيل الدخول</Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
