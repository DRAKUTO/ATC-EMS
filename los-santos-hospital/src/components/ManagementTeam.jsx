import { motion } from 'framer-motion';
import { FaLinkedin, FaEnvelope, FaQuoteLeft, FaUserTie } from 'react-icons/fa';
import { management } from '../data/content';

export default function ManagementTeam() {
  return (
    <section id="management" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent-50/20 to-transparent dark:via-dark-900/30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 text-sm font-medium mb-4">
            <FaUserTie />
            <span>الإدارة العليا</span>
          </span>
          <h2 className="section-title text-center">
            فريق <span className="gradient-text">الإدارة</span>
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto" />
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {management.map((person, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.2 }}
              className="group relative"
            >
              <div className="relative rounded-3xl overflow-hidden bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 hover:border-primary-200 dark:hover:border-primary-800 transition-all hover:shadow-2xl p-6">
                <div className="absolute top-0 right-0 w-32 h-32 gradient-bg opacity-5 rounded-bl-full" />

                <div className="flex items-start gap-5 relative z-10">
                  <div className="relative flex-shrink-0">
                    <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary-200 dark:border-primary-800 group-hover:border-primary-500 transition-all shadow-lg">
                      <img
                        src={person.image}
                        alt={person.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg gradient-bg flex items-center justify-center shadow-lg">
                      <FaQuoteLeft className="text-white text-xs" />
                    </div>
                  </div>

                  <div className="text-right flex-1">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 mb-2">
                      {person.roleAr}
                    </span>
                    <h3 className="text-2xl font-bold text-dark-900 dark:text-white mb-1">{person.name}</h3>
                    <p className="text-primary-600 dark:text-primary-400 font-medium text-sm mb-3">{person.role}</p>
                    <p className="text-sm text-dark-500 dark:text-dark-400 leading-relaxed">{person.description}</p>
                    <div className="flex gap-2 mt-4 justify-end">
                      <button className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center text-dark-500 dark:text-dark-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 transition-all">
                        <FaEnvelope />
                      </button>
                      <button className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-dark-700 flex items-center justify-center text-dark-500 dark:text-dark-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 transition-all">
                        <FaLinkedin />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
