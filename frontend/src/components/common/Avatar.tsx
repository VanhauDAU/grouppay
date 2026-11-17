import React from 'react';
import { getInitials } from '../../utils/format.js';
import { getMemberTheme, getContrastTextColor } from '../../utils/theme.js';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  className = '',
  onClick
}) => {
  const theme = getMemberTheme({ name, avatarUrl });
  const contrastText = getContrastTextColor(theme.hex);

  // Size map
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px] rounded-lg',
    sm: 'w-8 h-8 text-xs rounded-xl',
    md: 'w-10 h-10 text-xs rounded-2xl',
    lg: 'w-12 h-12 text-sm rounded-2xl',
    xl: 'w-16 h-16 text-lg rounded-3xl'
  };

  const isImage = avatarUrl && (avatarUrl.startsWith('data:image/') || avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://'));
  const isEmoji = avatarUrl && avatarUrl.startsWith('emoji:');
  const emojiChar = isEmoji ? avatarUrl.replace('emoji:', '') : null;

  if (isImage) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onClick={onClick}
        className={`${sizeClasses[size]} object-cover shadow-2xs ${className} ${onClick ? 'cursor-pointer hover:opacity-90' : ''}`}
      />
    );
  }

  if (isEmoji && emojiChar) {
    return (
      <div
        onClick={onClick}
        className={`${sizeClasses[size]} flex items-center justify-center shadow-2xs ${className} ${onClick ? 'cursor-pointer hover:scale-105 transition' : ''}`}
        style={{ backgroundColor: `${theme.hex}25`, border: `1px solid ${theme.hex}50` }}
      >
        <span className="leading-none text-center select-none" style={{ fontSize: size === 'xl' ? '28px' : size === 'lg' ? '22px' : '16px' }}>
          {emojiChar}
        </span>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses[size]} flex items-center justify-center font-extrabold shadow-2xs select-none transition ${className} ${onClick ? 'cursor-pointer hover:scale-105' : ''}`}
      style={{ backgroundColor: theme.hex, color: contrastText }}
    >
      {getInitials(name)}
    </div>
  );
};
