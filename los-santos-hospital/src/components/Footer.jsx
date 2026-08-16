import { FaHeartbeat, FaFacebook, FaTwitter, FaInstagram, FaLinkedin, FaYoutube, FaPhone, FaEnvelope, FaMapMarkerAlt, FaArrowUp } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { hospitalInfo } from '../data/content';

const quickLinks = [
  { name: 'الرئيسية', href: '#hero' },
  { name: 'عن المستشفى', href: '#about' },
  { name: 'الإدارة', href: '#management' },
  { name: 'الأقسام', href: '#departments' },
  { name: 'الخدمات', href: '#services' },
  { name: 'حجز موعد', href: '#booking' },
  { name: 'تواصل معنا', href: '#contact' },
];

const socialLinks = [
  { icon: FaFacebook, href: '#', color: 'hover:text-blue-600' },
  { icon: FaTwitter, href: '#', color: 'hover:text-sky-500' },
  { icon: FaInstagram, href: '#', color: 'hover:text-pink-500' },
  { icon: FaLinkedin, href: '#', color: 'hover:text-blue-700' },
  { icon: FaYoutube, href: '#', color: 'hover:text-red-600' },
];

export default function Footer() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="relative bg-dark-900 dark:bg-dark-950 text-white overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 to-transparent" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="text-right lg:col-span-1">
            <div className="flex items-center gap-3 mb-4 justify-end">
              <div className="w-10 h-10 rounded-xl gradient-bg flex items-center justify-center">
                <FaHeartbeat className="text-white text-lg" />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight">{hospitalInfo.name.split(' ').slice(0, 2).join(' ')}</h3>
                <p className="text-[10px] text-primary-400 font-medium -mt-1">{hospitalInfo.name.split(' ').slice(2).join(' ')}</p>
              </div>
            </div>
            <p className="text-dark-300 text-sm leading-relaxed mb-6">
              {hospitalInfo.description.slice(0, 120)}...
            </p>
            <div className="flex gap-3 justify-end">
              {socialLinks.map((social, i) => {
                const Icon = social.icon;
                return (
                  <a
                    key={i}
                    href={social.href}
                    className={`w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center text-dark-300 ${social.color} hover:bg-dark-700 transition-all`}
                  >
                    <Icon />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="text-right">
            <h4 className="font-bold text-lg mb-5 text-white">روابط سريعة</h4>
            <ul className="space-y-3">
              {quickLinks.map((link, i) => (
                <li key={i}>
                  <a
                    href={link.href}
                    className="text-dark-300 hover:text-primary-400 text-sm transition-all flex items-center gap-2 justify-end group"
                  >
                    <span>{link.name}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-dark-600 group-hover:bg-primary-500 transition-all" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-right">
            <h4 className="font-bold text-lg mb-5 text-white">أوقات العمل</h4>
            <ul className="space-y-3 text-sm text-dark-300">
              <li className="flex items-center gap-3 justify-end">
                <span>الطوارئ: 24 ساعة</span>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </li>
              <li className="flex items-center gap-3 justify-end">
                <span>الاستقبال: 24 ساعة</span>
                <span className="w-2 h-2 rounded-full bg-green-500" />
              </li>
              <li className="flex items-center gap-3 justify-end">
                <span>الزيارة: 10:00 - 20:00</span>
                <span className="w-2 h-2 rounded-full bg-primary-500" />
              </li>
              <li className="text-dark-400 text-xs mt-2">
                جميع أيام الأسبوع بما في ذلك العطلات الرسمية
              </li>
            </ul>
          </div>

          <div className="text-right">
            <h4 className="font-bold text-lg mb-5 text-white">معلومات التواصل</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-center gap-3 justify-end text-dark-300">
                <span>{hospitalInfo.phone}</span>
                <FaPhone className="text-primary-400 flex-shrink-0" />
              </li>
              <li className="flex items-center gap-3 justify-end text-dark-300">
                <span>{hospitalInfo.email}</span>
                <FaEnvelope className="text-primary-400 flex-shrink-0" />
              </li>
              <li className="flex items-center gap-3 justify-end text-dark-300">
                <span className="text-right">{hospitalInfo.address}</span>
                <FaMapMarkerAlt className="text-primary-400 flex-shrink-0" />
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-dark-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-dark-400 text-xs">
            © {new Date().getFullYear()} {hospitalInfo.name}. جميع الحقوق محفوظة.
          </p>
          <p className="text-dark-500 text-xs">
            Designed with care for Atlantic Roleplay
          </p>
        </div>
      </div>

      <button
        onClick={scrollToTop}
        className="fixed bottom-6 left-6 z-50 w-12 h-12 rounded-2xl gradient-bg text-white flex items-center justify-center shadow-xl hover:shadow-2xl hover:scale-110 transition-all animate-bounce"
      >
        <FaArrowUp />
      </button>
    </footer>
  );
}
