import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaPaperPlane, FaPhone, FaEnvelope, FaMapMarkerAlt, FaClock, FaCheckCircle, FaHeadset } from 'react-icons/fa';
import { hospitalInfo } from '../data/content';

export default function ContactSection() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);
    }, 1500);
  };

  const contactInfo = [
    { icon: FaPhone, label: 'رقم الطوارئ', value: hospitalInfo.emergency, color: 'text-red-500' },
    { icon: FaPhone, label: 'رقم الهاتف', value: hospitalInfo.phone },
    { icon: FaEnvelope, label: 'البريد الإلكتروني', value: hospitalInfo.email },
    { icon: FaMapMarkerAlt, label: 'العنوان', value: hospitalInfo.address },
    { icon: FaClock, label: 'مواعيد العمل', value: '24/7 - على مدار الساعة' },
  ];

  return (
    <section id="contact" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-50/30 to-transparent dark:via-dark-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
            <FaHeadset />
            <span>تواصل معنا</span>
          </span>
          <h2 className="section-title text-center">
            <span className="gradient-text">تواصل</span> معنا
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto mb-4" />
          <p className="text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
            فريقنا جاهز للرد على استفساراتكم على مدار الساعة
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="space-y-4">
              {contactInfo.map((info, index) => {
                const Icon = info.icon;
                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center gap-4 p-5 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 hover:border-primary-200 dark:hover:border-primary-800 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-xl gradient-bg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <Icon className={`text-lg text-white ${info.color || ''}`} />
                    </div>
                    <div className="text-right flex-1">
                      <p className="text-xs text-dark-500 dark:text-dark-400 mb-0.5">{info.label}</p>
                      <p className="font-semibold text-dark-900 dark:text-white text-sm">{info.value}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="p-8 rounded-3xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 shadow-xl">
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                    <FaCheckCircle className="text-4xl text-green-500" />
                  </div>
                  <h3 className="text-xl font-bold text-dark-900 dark:text-white mb-2">تم إرسال رسالتك!</h3>
                  <p className="text-dark-500 dark:text-dark-400">سنرد عليك في أقرب وقت ممكن</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">الاسم الكامل</label>
                      <input type="text" required placeholder="أدخل اسمك" className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">البريد الإلكتروني</label>
                      <input type="email" required placeholder="أدخل بريدك" className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">رقم الهاتف</label>
                    <input type="tel" required placeholder="أدخل رقم هاتفك" className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">الرسالة</label>
                    <textarea rows={4} required placeholder="اكتب رسالتك هنا..." className="w-full px-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right resize-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all" />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl gradient-bg text-white font-bold flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-primary-500/30 transition-all disabled:opacity-60"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <FaPaperPlane />
                        <span>إرسال الرسالة</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
