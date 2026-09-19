import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

export function Forest({ width = 170, height = 150 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 175">
      <Ellipse cx="108" cy="142" rx="90" ry="24" fill="#B6D8A6" />
      <Path
        d="M82 154 Q120 128 98 109 Q89 99 103 88"
        fill="none"
        stroke="#F7E5AA"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <Tree x={45} y={66} scale={1} />
      <Tree x={133} y={48} scale={1.25} />
      <Tree x={157} y={100} scale={0.64} />
      <Tree x={18} y={111} scale={0.52} />
      <Circle cx="76" cy="133" r="4" fill="#FFE387" />
      <Circle cx="163" cy="148" r="3" fill="#FFF5BC" />
      <Path
        d="M72 77 q8 -10 16 0 q8 -10 16 0"
        fill="none"
        stroke="#92C892"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </Svg>
  );
}
function Tree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <G transform={`translate(${x}, ${y}) scale(${scale})`}>
      <Rect x="18" y="32" width="9" height="40" rx="4" fill="#967546" />
      <Path d="M22 -20 Q-14 15 0 31 Q-10 50 23 54 Q56 50 43 30 Q57 14 22 -20" fill="#559A65" />
      <Path d="M22 -20 Q7 8 17 23 Q9 41 24 53 Q56 50 43 30 Q57 14 22 -20" fill="#347F53" />
      <Path d="M23 8 V42" stroke="#80B576" strokeWidth="2" strokeLinecap="round" />
    </G>
  );
}
