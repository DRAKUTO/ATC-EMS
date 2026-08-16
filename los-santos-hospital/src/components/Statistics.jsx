import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { FaHeartbeat, FaUserMd, FaCut, FaBuilding, FaChartLine } from 'react-icons/fa';
import { stats } from '../data/content';

const iconMap = {
  FaHeartbeat, FaUserMd, FaScalpel, FaBuilding,
};

function Counter({ value, suffix, label, icon: Icon, index }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const duration = 2000;
          const steps = 60;
          const stepValue = value / steps;
          let current = 0;
          const interval = setInterval(() => {
            current += stepValue;
            if (current >= value) {
              setCount(value);
              clearInterval(interval);
            } else {
              setCount(Math.floor(current));
            }
          }, duration / steps);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className="relative group"
    >
      <div className="p-8 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 text-center hover:border-primary-200 dark:hover:border-primary-800 transition-all hover:shadow-2xl hover:-translate-y-1">
        <div className="w-16 h-16 rounded-2xl gradient-bg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform group-hover:rotate-6">
          <Icon className="text-2xl text-white" />
        </div>
        <div className="text-4xl md:text-5xl font-bold gradient-text mb-2 font-display">
          {count.toLocaleString()}{suffix}
        </div>
        <p className="text-dark-600 dark:text-dark-400 font-medium">{label}</p>
      </div>
    </motion.div>
  );
}

export default function Statistics() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-50/50 via-white to-primary-50/30 dark:from-dark-900/50 dark:via-dark-950 dark:to-dark-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
            <FaChartLine />
            <span>إحصائيات</span>
          </span>
          <h2 className="section-title text-center">
            مستشفانا <span className="gradient-text">بالأرقام</span>
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto" />
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = iconMap[stat.icon] || FaHeartbeat;
            return (
              <Counter
                key={index}
                value={stat.value}
                suffix={stat.suffix}
                label={stat.label}
                icon={Icon}
                index={index}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
