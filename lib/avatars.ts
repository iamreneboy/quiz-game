export const AVATARS = [
  { key: 'coffee', emoji: '☕', label: 'Coffee Cup' },
  { key: 'cactus', emoji: '🌵', label: 'Cactus' },
  { key: 'duck', emoji: '🦆', label: 'Rubber Duck' },
  { key: 'robot', emoji: '🤖', label: 'Robot' },
  { key: 'cat', emoji: '🐱', label: 'Office Cat' },
  { key: 'clip', emoji: '📎', label: 'Paperclip' },
  { key: 'plant', emoji: '🪴', label: 'Desk Plant' },
  { key: 'donut', emoji: '🍩', label: 'Donut' },
  { key: 'bulb', emoji: '💡', label: 'Big Idea' },
  { key: 'headset', emoji: '🎧', label: 'Headset' },
  { key: 'juice', emoji: '🧃', label: 'Juice Box' },
  { key: 'rocket', emoji: '🚀', label: 'Rocket' },
];
export const COLORS = ['#f59e0b','#38bdf8','#a78bfa','#34d399','#fb7185','#facc15','#f97316','#22d3ee'];

export function avatarEmoji(key: string): string {
  return AVATARS.find(a => a.key === key)?.emoji ?? '🙂';
}
