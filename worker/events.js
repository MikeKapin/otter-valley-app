// V1: Hardcoded events data (same as club website)
// Can be migrated to D1 later
const EVENTS = [
  {
    id: 1,
    title: 'Spring Sight-In Day',
    date: '2026-04-18',
    time: '9:00 AM - 3:00 PM',
    description: 'Free sight-in day for members. Bring your rifles and get ready for the season. Experienced members on hand to help.',
    category: 'shooting',
  },
  {
    id: 2,
    title: 'Annual General Meeting',
    date: '2026-04-25',
    time: '7:00 PM',
    description: 'Annual general meeting for all members. Election of officers, financial report, and planning for the upcoming season.',
    category: 'meeting',
  },
  {
    id: 3,
    title: 'Kids Fishing Derby',
    date: '2026-05-17',
    time: '8:00 AM - 12:00 PM',
    description: 'Annual kids fishing derby at the club pond. Open to members\' children and grandchildren ages 5-15. Prizes for biggest catch.',
    category: 'fishing',
  },
  {
    id: 4,
    title: 'Sporting Clays Tournament',
    date: '2026-06-07',
    time: '9:00 AM',
    description: '50-bird sporting clays tournament. Open to all members. Prizes for top 3 in each class.',
    category: 'shooting',
  },
  {
    id: 5,
    title: 'Summer BBQ & Family Day',
    date: '2026-07-12',
    time: '11:00 AM - 4:00 PM',
    description: 'Annual summer barbecue and family day. Food, games, and fun for the whole family. Members and their families welcome.',
    category: 'social',
  },
  {
    id: 6,
    title: 'Hunter Safety Course',
    date: '2026-08-22',
    time: '8:00 AM - 5:00 PM',
    description: 'Ontario hunter education course hosted at the club. Registration required. Contact ovrag@hotmail.com to sign up.',
    category: 'education',
  },
];

export async function handleEvents(request, env) {
  const now = new Date().toISOString().split('T')[0];
  const upcoming = EVENTS.filter(e => e.date >= now).sort((a, b) => a.date.localeCompare(b.date));
  return new Response(JSON.stringify({ events: upcoming }));
}
