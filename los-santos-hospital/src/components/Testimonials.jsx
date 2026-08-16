import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaQuoteLeft, FaStar, FaChevronLeft, FaChevronRight, FaComments } from 'react-icons/fa';
import { testimonials } from '../data/content';

export default function Testimonials() {
  const [current, setCurrent] = useState(0);

  const next = () => setCurrent((prev) => (prev + 1) % testimonials.length);
  const prev = () => setCurrent((prev) => (prev - 1 + testimonials.length) % testimonials.length);

  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-accent-50/30 via-white to-accent-50/20 dark:from-dark-900/30 dark:via-dark-950 dark:to-dark-900/30" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 text-sm font-medium mb-4">
            <FaComments />
            <span>آراء المرضى</span>
          </span>
          <h2 className="section-title text-center">
            ماذا يقول <span className="gradient-text">مرضانا</span>
          </h2>
          <div className="w-24 h-1 gradient-bg rounded-full mx-auto" />
        </motion.div>

        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.4 }}
                className="relative p-10 rounded-3xl bg-white dark:bg-dark-800/50 border border-gray-100 dark:border-dark-700/50 shadow-xl"
              >
                <FaQuoteLeft className="text-4xl text-primary-200 dark:text-primary-800 absolute top-6 right-6" />

                <div className="flex items-center gap-4 mb-6 justify-end">
                  <div className="text-right">
                    <h4 className="text-lg font-bold text-dark-900 dark:text-white">{testimonials[current].name}</h4>
                    <p className="text-sm text-dark-500 dark:text-dark-400">{testimonials[current].role}</p>
                  </div>
                  <img
                    src={testimonials[current].image}
                    alt={testimonials[current].name}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-primary-200 dark:border-primary-800"
                  />
                </div>

                <p className="text-lg text-dark-600 dark:text-dark-300 leading-relaxed mb-6 text-right">
                  "{testimonials[current].text}"
                </p>

                <div className="flex justify-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <FaStar
                      key={i}
                      className={`text-lg ${i < testimonials[current].rating ? 'text-yellow-400' : 'text-gray-200 dark:text-dark-600'}`}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex justify-center gap-4 mt-8">
              <button
                onClick={prev}
                className="w-12 h-12 rounded-xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 flex items-center justify-center text-dark-600 dark:text-dark-300 hover:bg-primary-600 hover:text-white dark:hover:bg-primary-600 transition-all shadow-lg"
              >
                <FaChevronRight />
              </button>
              <div className="flex items-center gap-2">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      i === current
                        ? 'w-8 bg-primary-600'
                        : 'bg-gray-300 dark:bg-dark-600 hover:bg-primary-400'
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={next}
                className="w-12 h-12 rounded-xl bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 flex items-center justify-center text-dark-600 dark:text-dark-300 hover:bg-primary-600 hover:text-white dark:hover:bg-primary-600 transition-all shadow-lg"
              >
                <FaChevronLeft />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
