import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { FaHeartbeat, FaUserCircle, FaEdit, FaSave, FaSignOutAlt, FaCalendarCheck, FaUserMd, FaClipboardList, FaBell } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: user?.name || '', phone: user?.phone || '' });

  if (!user) {
    navigate('/login');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSave = () => {
    updateProfile(formData);
    setEditing(false);
  };

  const stats = [
    { label: 'مواعيدي', value: '3', icon: FaCalendarCheck, color: 'from-blue-500 to-cyan-500' },
    { label: 'الزيارات السابقة', value: '7', icon: FaClipboardList, color: 'from-emerald-500 to-teal-500' },
    { label: 'الأطباء المفضلون', value: '2', icon: FaUserMd, color: 'from-purple-500 to-pink-500' },
    { label: 'إشعارات', value: '1', icon: FaBell, color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 pt-24 pb-12 px-4">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-10"
        >
          <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
            <FaSignOutAlt /> <span>تسجيل الخروج</span>
          </button>
          <div className="text-right">
            <h1 className="text-3xl font-bold text-dark-900 dark:text-white">مرحباً، {user.name}</h1>
            <p className="text-dark-500 dark:text-dark-400 text-sm">لوحة التحكم الشخصية</p>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-1"
          >
            <div className="p-6 rounded-3xl bg-white dark:bg-dark-800/70 border border-gray-100 dark:border-dark-700/50 shadow-xl">
              <div className="text-center mb-5">
                <div className="w-24 h-24 rounded-3xl gradient-bg flex items-center justify-center mx-auto mb-4">
                  <FaUserCircle className="text-4xl text-white" />
                </div>
                {editing ? (
                  <div className="space-y-3">
                    <input
                      value={formData.name}
                      onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-center text-lg font-bold focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    />
                    <input
                      value={formData.phone}
                      onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                      className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-center text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                    />
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-bold text-dark-900 dark:text-white">{user.name}</h2>
                    <p className="text-dark-500 dark:text-dark-400 text-sm">{user.email}</p>
                    {user.phone && <p className="text-dark-500 dark:text-dark-400 text-xs mt-1">{user.phone}</p>}
                  </>
                )}
              </div>
              {editing ? (
                <button onClick={handleSave} className="w-full py-3 rounded-2xl gradient-bg text-white font-semibold flex items-center justify-center gap-2 hover:shadow-lg transition-all">
                  <FaSave /> <span>حفظ التغييرات</span>
                </button>
              ) : (
                <button onClick={() => setEditing(true)} className="w-full py-3 rounded-2xl border-2 border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-300 font-semibold flex items-center justify-center gap-2 hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 transition-all">
                  <FaEdit /> <span>تعديل الملف الشخصي</span>
                </button>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              {stats.map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="p-5 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 shadow-lg flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                      <Icon className="text-white text-lg" />
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-dark-900 dark:text-white">{stat.value}</p>
                      <p className="text-xs text-dark-500 dark:text-dark-400">{stat.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 rounded-3xl bg-white dark:bg-dark-800/70 border border-gray-100 dark:border-dark-700/50 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <Link to="/#booking" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">حجز موعد جديد</Link>
                <h3 className="font-bold text-dark-900 dark:text-white">المواعيد القادمة</h3>
              </div>
              <div className="text-center py-8 text-dark-500 dark:text-dark-400">
                <FaCalendarCheck className="text-4xl mx-auto mb-3 opacity-30" />
                <p>لا توجد مواعيد قادمة</p>
                <a href="/#booking" className="text-primary-600 dark:text-primary-400 font-medium text-sm hover:underline mt-2 inline-block">احجز موعدك الآن</a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
