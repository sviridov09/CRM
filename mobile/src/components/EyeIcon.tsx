import Svg, { Circle, Line, Path } from 'react-native-svg';

/** Глаз для поля пароля; crossed — перечёркнутый. */
export function EyeIcon({ crossed, color, size = 24 }: { crossed: boolean; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={3} />
      {crossed && <Line x1={3} y1={3} x2={21} y2={21} />}
    </Svg>
  );
}
