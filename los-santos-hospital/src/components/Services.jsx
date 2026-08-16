import { motion } from 'framer-motion';
import { FaUserMd, FaAmbulance, FaCut, FaSearchPlus, FaWalking, FaHome, FaConciergeBell, FaHeart } from 'react-icons/fa';
import { services } from '../data/content';

const iconMap = {
  FaUserMd, FaAmbulance, FaCut, FaSearchPlus, FaWalking, FaHome,
};

export default function Services() {
  return (
    <section id="services" className="relative py-24 overflow-hidden">
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 text-sm font-medium mb-4">
            <FaConciergeBell />
            <span>خدماتنا</span>
          </span>
          <h2 className="section-title text-center">
            <span className="gradient-text">خدماتنا</span> الطبية
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto mb-4" />
          <p className="text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
            نقدم مجموعة متكاملة من الخدمات الطبية بأعلى معايير الجودة والاحترافية
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => {
            const Icon = iconMap[service.icon] || FaHeart;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="group relative p-8 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 hover:border-primary-200 dark:hover:border-primary-800 transition-all hover:shadow-2xl hover:shadow-primary-500/10"
              >
                <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform group-hover:rotate-6">
                    <Icon className="text-2xl text-white" />
                  </div>
                  <div className="text-right">
                    <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-1">{service.name}</h3>
                    <p className="text-sm text-dark-500 dark:text-dark-400 leading-relaxed">{service.description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
