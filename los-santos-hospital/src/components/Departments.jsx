import { motion } from 'framer-motion';
import { FaStethoscope, FaAmbulance, FaCut, FaHeartbeat, FaBrain, FaBaby, FaBone, FaAllergies, FaVenus, FaXRay, FaFlask, FaBuilding } from 'react-icons/fa';
import { departments } from '../data/content';

const iconMap = {
  FaStethoscope, FaAmbulance, FaCut, FaHeartbeat, FaBrain,
  FaBaby, FaBone, FaAllergies, FaVenus, FaXRay, FaFlask,
};

export default function Departments() {
  return (
    <section id="departments" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-primary-50/50 dark:bg-dark-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
            <FaBuilding />
            <span>التخصصات الطبية</span>
          </span>
          <h2 className="section-title text-center">
            <span className="gradient-text">الأقسام</span> الطبية
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto mb-4" />
          <p className="text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
            نقدم مجموعة متكاملة من التخصصات الطبية لتلبية جميع احتياجاتكم الصحية
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {departments.map((dept, index) => {
            const Icon = iconMap[dept.icon] || FaStethoscope;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.05, duration: 0.4 }}
                className="group relative p-6 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 hover:border-transparent transition-all hover:shadow-2xl cursor-pointer overflow-hidden"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300"
                  style={{ background: `linear-gradient(135deg, ${dept.color}, ${dept.color}88)` }}
                />
                <div className="relative z-10 text-center">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300"
                    style={{ background: `${dept.color}15` }}
                  >
                    <Icon className="text-2xl" style={{ color: dept.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{dept.name}</h3>
                  <p className="text-sm text-dark-500 dark:text-dark-400">{dept.description}</p>
                </div>
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                  style={{ background: dept.color }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
