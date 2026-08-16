import { motion } from 'framer-motion';
import { FaHospital, FaMicroscope, FaUserMd, FaAward, FaHandHoldingHeart, FaShieldAlt } from 'react-icons/fa';

const features = [
  { icon: FaMicroscope, title: 'أحدث التقنيات', description: 'أجهزة طبية متطورة وفق أعلى المعايير العالمية' },
  { icon: FaUserMd, title: 'نخبة الأطباء', description: 'أمهر الأطباء والمتخصصين في جميع المجالات' },
  { icon: FaAward, title: 'جودة عالمية', description: 'معايير جودة صحية عالمية معتمدة' },
  { icon: FaHandHoldingHeart, title: 'رعاية متكاملة', description: 'خدمات صحية شاملة تلبي جميع الاحتياجات' },
  { icon: FaShieldAlt, title: 'سلامة المرضى', description: 'أعلى معايير السلامة والأمان الصحي' },
];

export default function AboutSection() {
  return (
    <section id="about" className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary-50/30 to-transparent dark:via-dark-900/50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium mb-4">
            <FaHospital />
            <span>من نحن</span>
          </span>
          <h2 className="section-title text-center">
            <span className="gradient-text">نبذة عن</span> المستشفى
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto mb-6" />
          <p className="text-lg text-dark-600 dark:text-dark-400 max-w-4xl mx-auto leading-relaxed">
            LOS SANTOS HOSPITAL CENTRAL هو أحد أكثر المراكز الطبية تطورًا في مدينة ATLANTIC ROLEPLAY،
            ويضم أحدث المعدات والتقنيات الطبية الحديثة، بالإضافة إلى نخبة من أمهر الأطباء والمتخصصين
            في مختلف المجالات الطبية، مما يجعله الوجهة الأولى للرعاية الصحية المتكاملة داخل المدينة.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ delay: index * 0.1, duration: 0.5 }}
                className="group relative p-6 rounded-2xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 hover:border-primary-200 dark:hover:border-primary-800 transition-all hover:shadow-2xl hover:shadow-primary-500/10 hover:-translate-y-2"
              >
                <div className="w-14 h-14 rounded-2xl gradient-bg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform group-hover:rotate-3">
                  <Icon className="text-2xl text-white" />
                </div>
                <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-dark-500 dark:text-dark-400 leading-relaxed">{feature.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
