import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FaHeartbeat, FaEnvelope, FaPaperPlane, FaCheckCircle, FaArrowRight } from 'react-icons/fa';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 py-20 px-4">
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent-500/10 rounded-full blur-3xl" />
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
          {!sent ? (
            <>
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white">استعادة كلمة المرور</h2>
              <p className="text-dark-500 dark:text-dark-400 mt-2">أدخل بريدك الإلكتروني وسنرسل لك رابط الاستعادة</p>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white">تم الإرسال!</h2>
              <p className="text-dark-500 dark:text-dark-400 mt-2">تحقق من بريدك الإلكتروني</p>
            </>
          )}
        </div>

        <div className="p-8 rounded-3xl bg-white dark:bg-dark-800/70 backdrop-blur-xl border border-gray-100 dark:border-dark-700/50 shadow-2xl">
          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                <FaCheckCircle className="text-4xl text-green-500" />
              </div>
              <p className="text-dark-600 dark:text-dark-300 mb-6">تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني</p>
              <Link to="/login" className="inline-flex items-center gap-2 text-primary-600 dark:text-primary-400 font-semibold hover:underline">
                <FaArrowRight />
                <span>العودة إلى تسجيل الدخول</span>
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">البريد الإلكتروني</label>
                <div className="relative">
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400"><FaEnvelope /></div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="أدخل بريدك الإلكتروني"
                    required
                    className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full py-3.5 rounded-2xl gradient-bg text-white font-bold text-lg flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-primary-500/30 transition-all disabled:opacity-60">
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><FaPaperPlane /><span>إرسال رابط الاستعادة</span></>
                )}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-primary-600 dark:text-primary-400 text-sm font-semibold hover:underline">
                  العودة إلى تسجيل الدخول
                </Link>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
