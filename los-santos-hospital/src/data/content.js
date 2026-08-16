export const hospitalInfo = {
  name: 'LOS SANTOS HOSPITAL CENTRAL',
  shortName: 'LSHC',
  tagline: 'حياتك أمانة في أيد أمينة',
  address: '8040 - Integrity Way, Atlantic Roleplay',
  phone: '+1 (555) 123-4567',
  email: 'info@lshospital.arp',
  emergency: '+1 (555) 911-0000',
  description: 'LOS SANTOS HOSPITAL CENTRAL هو أحد أكثر المراكز الطبية تطورًا في مدينة ATLANTIC ROLEPLAY، ويضم أحدث المعدات والتقنيات الطبية الحديثة، بالإضافة إلى نخبة من أمهر الأطباء والمتخصصين في مختلف المجالات الطبية، مما يجعله الوجهة الأولى للرعاية الصحية المتكاملة داخل المدينة.',
  founded: 2015,
  patientsServed: 50000,
  successRate: 98.7,
};

export const management = [
  {
    name: 'Emma Adams',
    role: 'Hospital Director',
    roleAr: 'رئيسة المستشفى',
    image: 'https://i.pravatar.cc/400?img=1',
    description: 'قيادة استثنائية بخبرة تزيد عن 15 عامًا في الإدارة الصحية.',
  },
  {
    name: 'Enzo Lfatwaki',
    role: 'Deputy Director',
    roleAr: 'مساعد رئيسة المستشفى',
    image: 'https://i.pravatar.cc/400?img=68',
    description: 'خبير في تطوير الأنظمة الصحية وتحسين جودة الرعاية.',
  },
];

export const departments = [
  { name: 'الطب العام', icon: 'FaStethoscope', description: 'رعاية صحية أولية شاملة', color: '#0a6baf' },
  { name: 'الطوارئ', icon: 'FaAmbulance', description: 'خدمات طوارئ على مدار الساعة', color: '#dc2626' },
  { name: 'الجراحة', icon: 'FaCut', description: 'عمليات جراحية متقدمة', color: '#0d9488' },
  { name: 'القلب', icon: 'FaHeartbeat', description: 'رعاية قلبية متخصصة', color: '#e11d48' },
  { name: 'الأعصاب', icon: 'FaBrain', description: 'تشخيص وعلاج الأمراض العصبية', color: '#7c3aed' },
  { name: 'الأطفال', icon: 'FaBaby', description: 'رعاية متكاملة للأطفال', color: '#f59e0b' },
  { name: 'العظام', icon: 'FaBone', description: 'جراحة العظام والمفاصل', color: '#0891b2' },
  { name: 'الجلدية', icon: 'FaAllergies', description: 'علاج الأمراض الجلدية', color: '#db2777' },
  { name: 'النساء والتوليد', icon: 'FaVenus', description: 'رعاية الحمل والولادة', color: '#c026d3' },
  { name: 'الأشعة', icon: 'FaXRay', description: 'التصوير الطبي المتقدم', color: '#2563eb' },
  { name: 'المختبرات الطبية', icon: 'FaFlask', description: 'تحاليل وفحوصات مخبرية', color: '#059669' },
];

export const services = [
  { name: 'الاستشارات الطبية', icon: 'FaUserMd', description: 'استشارات متخصصة مع أفضل الأطباء' },
  { name: 'الإسعاف والطوارئ', icon: 'FaAmbulance', description: 'خدمة إسعاف مجهزة على مدار الساعة' },
  { name: 'العمليات الجراحية', icon: 'FaCut', description: 'غرف عمليات مجهزة بأحدث التقنيات' },
  { name: 'التشخيص المبكر', icon: 'FaSearchPlus', description: 'برامج فحص مبكر للأمراض المزمنة' },
  { name: 'العلاج الطبيعي', icon: 'FaWalking', description: 'برامج تأهيل وعلاج طبيعي متكامل' },
  { name: 'الرعاية المنزلية', icon: 'FaHome', description: 'خدمات رعاية صحية منزلية متكاملة' },
];

export const testimonials = [
  {
    name: 'Sarah Johnson',
    role: 'مريضة',
    image: 'https://i.pravatar.cc/100?img=5',
    text: 'تجربة رائعة مع فريق LOS SANTOS HOSPITAL. العناية والاهتمام يفوق كل التوقعات. أنصح الجميع بهذا المستشفى.',
    rating: 5,
  },
  {
    name: 'Michael Chen',
    role: 'مريض',
    image: 'https://i.pravatar.cc/100?img=12',
    text: 'أفضل مستشفى في المدينة. الأطباء على مستوى عالٍ جدًا من الكفاءة والاحترافية.',
    rating: 5,
  },
  {
    name: 'Lisa Rodriguez',
    role: 'مريضة',
    image: 'https://i.pravatar.cc/100?img=9',
    text: 'شكرًا لفريق الطوارئ على سرعة الاستجابة والعلاج الممتاز. أنقذتم حياة والدي.',
    rating: 5,
  },
  {
    name: 'James Wilson',
    role: 'مريض',
    image: 'https://i.pravatar.cc/100?img=20',
    text: 'الخدمة ممتازة والموظفون ودودون للغاية. المركز نظيف ومنظم ويوفر أحدث التقنيات.',
    rating: 4,
  },
];

export const doctors = [
  { id: 1, name: 'د. أحمد الخطيب', specialty: 'الطب العام', department: 'الطب العام' },
  { id: 2, name: 'د. سارة الحربي', specialty: 'طب الطوارئ', department: 'الطوارئ' },
  { id: 3, name: 'د. عمر السعيد', specialty: 'جراحة عامة', department: 'الجراحة' },
  { id: 4, name: 'د. نورة القحطاني', specialty: 'أمراض القلب', department: 'القلب' },
  { id: 5, name: 'د. فيصل المالكي', specialty: 'جراحة الأعصاب', department: 'الأعصاب' },
  { id: 6, name: 'د. مريم العلي', specialty: 'طب الأطفال', department: 'الأطفال' },
  { id: 7, name: 'د. خالد العتيبي', specialty: 'جراحة العظام', department: 'العظام' },
  { id: 8, name: 'د. هدى الشمري', specialty: 'الأمراض الجلدية', department: 'الجلدية' },
  { id: 9, name: 'د. ليلى العنزي', specialty: 'النساء والتوليد', department: 'النساء والتوليد' },
  { id: 10, name: 'د. عبدالله الغامدي', specialty: 'الأشعة', department: 'الأشعة' },
  { id: 11, name: 'د. منى الزهراني', specialty: 'المختبرات الطبية', department: 'المختبرات الطبية' },
];

export const stats = [
  { value: 50000, label: 'مريض تعافى', icon: 'FaHeartbeat', suffix: '+' },
  { value: 150, label: 'طبيب متخصص', icon: 'FaUserMd', suffix: '+' },
  { value: 12000, label: 'عملية ناجحة', icon: 'FaCut', suffix: '+' },
  { value: 11, label: 'قسم طبي', icon: 'FaBuilding', suffix: '' },
];
