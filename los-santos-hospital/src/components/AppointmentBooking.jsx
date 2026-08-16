import { useState } from 'react';
import { motion } from 'framer-motion';
import { FaCalendarCheck, FaUser, FaPhone, FaEnvelope, FaStethoscope, FaUserMd, FaCalendarAlt, FaClock, FaPaperPlane, FaCheckCircle } from 'react-icons/fa';
import { departments, doctors } from '../data/content';

export default function AppointmentBooking() {
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', department: '', doctor: '', date: '', time: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const filteredDoctors = formData.department
    ? doctors.filter((d) => d.department === formData.department)
    : [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'department' ? { doctor: '' } : {}),
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      setFormData({ name: '', phone: '', email: '', department: '', doctor: '', date: '', time: '' });
      setTimeout(() => setSubmitted(false), 5000);
    }, 1500);
  };

  return (
    <section id="booking" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-50/30 via-white to-accent-50/20 dark:from-dark-900/50 dark:via-dark-950 dark:to-dark-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
            <FaCalendarCheck />
            <span>حجز المواعيد</span>
          </span>
          <h2 className="section-title text-center">
            احجز <span className="gradient-text">موعدك</span> الآن
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto mb-4" />
          <p className="text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
            احجز موعدك مع أفضل الأطباء في أسرع وقت وبأسهل الطرق
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto"
        >
          <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 shadow-xl p-8 md:p-10">
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                  <FaCheckCircle className="text-4xl text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-dark-900 dark:text-white mb-3">تم استلام طلبك بنجاح!</h3>
                <p className="text-dark-500 dark:text-dark-400">سيتم التواصل معك قريبًا لتأكيد الموعد</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-5">
                  <InputField
                    icon={FaUser}
                    label="الاسم الكامل"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="أدخل اسمك الكامل"
                    required
                  />
                  <InputField
                    icon={FaPhone}
                    label="رقم الهاتف"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="أدخل رقم الهاتف"
                    required
                    type="tel"
                  />
                </div>

                <InputField
                  icon={FaEnvelope}
                  label="البريد الإلكتروني"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="أدخل بريدك الإلكتروني"
                  type="email"
                  required
                />

                <div className="grid sm:grid-cols-2 gap-5">
                  <SelectField
                    icon={FaStethoscope}
                    label="التخصص"
                    name="department"
                    value={formData.department}
                    onChange={handleChange}
                    options={departments.map((d) => ({ value: d.name, label: d.name }))}
                    placeholder="اختر التخصص"
                    required
                  />
                  <SelectField
                    icon={FaUserMd}
                    label="اختر الطبيب"
                    name="doctor"
                    value={formData.doctor}
                    onChange={handleChange}
                    options={filteredDoctors.map((d) => ({ value: d.name, label: d.name }))}
                    placeholder={formData.department ? 'اختر الطبيب' : 'اختر التخصص أولاً'}
                    required
                    disabled={!formData.department}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <InputField
                    icon={FaCalendarAlt}
                    label="التاريخ"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    type="date"
                    required
                  />
                  <InputField
                    icon={FaClock}
                    label="الوقت"
                    name="time"
                    value={formData.time}
                    onChange={handleChange}
                    type="time"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 rounded-2xl gradient-bg text-white font-bold text-lg flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-primary-500/30 transition-all disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <FaPaperPlane />
                      <span>تأكيد الحجز</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function InputField({ icon: Icon, label, name, value, onChange, placeholder, type = 'text', required }) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">{label}</label>
      <div className="relative">
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400">
          <Icon />
        </div>
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
        />
      </div>
    </div>
  );
}

function SelectField({ icon: Icon, label, name, value, onChange, options, placeholder, required, disabled }) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2 text-right">{label}</label>
      <div className="relative">
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 z-10">
          <Icon />
        </div>
        <select
          name={name}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          className="w-full pr-12 pl-4 py-3.5 rounded-xl border border-gray-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white text-right appearance-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all disabled:opacity-50"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-400 pointer-events-none">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
