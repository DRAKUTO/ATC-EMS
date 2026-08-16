import { lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { FaPhoneAlt, FaCalendarCheck, FaHospital, FaMapMarkerAlt, FaAmbulance } from 'react-icons/fa';
import { hospitalInfo } from '../data/content';
import ErrorBoundary from './ErrorBoundary';

const HospitalBuilding3D = lazy(() => import('./HospitalBuilding3D'));

export default function HeroSection() {
  const handleBookingClick = (e) => {
    e.preventDefault();
    const el = document.querySelector('#booking');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleContactClick = (e) => {
    e.preventDefault();
    const el = document.querySelector('#contact');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="hero" className="relative min-h-screen flex items-center overflow-hidden pt-20">
      <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 via-white to-accent-50/30 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950" />

      <div className="absolute top-20 left-10 w-72 h-72 bg-primary-500/10 dark:bg-primary-500/5 rounded-full blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent-500/10 dark:bg-accent-500/5 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="text-right"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-6"
            >
              <FaHospital className="text-xs" />
              <span>أفضل مركز طبي في ATLANTIC ROLEPLAY</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-dark-900 dark:text-white leading-tight mb-4"
            >
              <span className="gradient-text">{hospitalInfo.name}</span>
              <br />
              <span className="text-dark-700 dark:text-dark-200">حياتك أمانة</span>
              <span className="gradient-text"> في أيد أمينة</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-lg text-dark-600 dark:text-dark-400 leading-relaxed mb-8 max-w-xl mr-auto"
            >
              {hospitalInfo.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-wrap gap-4 justify-end"
            >
              <button
                onClick={handleBookingClick}
                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl gradient-bg text-white font-semibold text-lg overflow-hidden transition-all hover:shadow-2xl hover:shadow-primary-500/30 hover:scale-105"
              >
                <FaCalendarCheck className="text-xl group-hover:rotate-12 transition-transform" />
                <span>احجز موعدك الآن</span>
              </button>
              <button
                onClick={handleContactClick}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl border-2 border-primary-600 dark:border-primary-400 text-primary-700 dark:text-primary-300 font-semibold text-lg hover:bg-primary-600 hover:text-white dark:hover:bg-primary-500 dark:hover:text-white transition-all hover:shadow-xl"
              >
                <FaPhoneAlt className="text-xl" />
                <span>تواصل معنا</span>
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap gap-6 mt-8 justify-end"
            >
              <div className="flex items-center gap-2 text-dark-500 dark:text-dark-400 text-sm">
                <FaAmbulance className="text-red-500" />
                <span>طوارئ على مدار الساعة</span>
              </div>
              <div className="flex items-center gap-2 text-dark-500 dark:text-dark-400 text-sm">
                <FaMapMarkerAlt className="text-primary-500" />
                <span>{hospitalInfo.address}</span>
              </div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="hidden lg:block"
          >
            <ErrorBoundary>
              <Suspense fallback={<div className="w-full h-[400px] md:h-[500px] flex items-center justify-center text-dark-400">Loading 3D...</div>}>
                <HospitalBuilding3D />
              </Suspense>
            </ErrorBoundary>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-dark-950 to-transparent" />
    </section>
  );
}
