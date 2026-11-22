import { useId } from "react";

/** Technical drawings for each utility: image planes, type metrics, asset layers and a timing trace. */
export function ToolArt({kind}:{kind:"images"|"documents"|"fonts"|"assets"|"audit"}) {
  const id=useId().replace(/:/g, "");
  const line=`url(#line${id})`, fill=`url(#fill${id})`;
  return <svg viewBox="0 0 270 112" fill="none" className="tool-art" aria-hidden="true">
    <defs><linearGradient id={`line${id}`} x1=".08" y1="0" x2=".97" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#8ecbff"/><stop offset=".6" stopColor="#4b98ec"/><stop offset="1" stopColor="#2762ad"/></linearGradient><linearGradient id={`fill${id}`} x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop stopColor="#1e426e"/><stop offset="1" stopColor="#0e1c35"/></linearGradient></defs>
    {kind==="images" ? <g transform="translate(90 18)">
      <g transform="rotate(-13 49 43)"><rect x="-3" y="2" width="91" height="64" rx="7" fill="#1c1729" stroke="#56436b"/><rect x="6" y="9" width="73" height="47" rx="3" stroke="#403050"/></g>
      <g transform="rotate(7 50 50)"><rect x="14" y="10" width="90" height="64" rx="7" fill={fill} stroke={line} strokeWidth="1.6"/><path d="m22 62 25-25 15 16 11-10 23 22H22z" fill="#3978bf" opacity=".65"/><path d="m22 62 25-25 15 16 11-10 23 22" stroke="#a6d6ff" strokeWidth="1.6"/><circle cx="78" cy="28" r="6.5" fill="#c7e5ff"/></g>
      <path d="M-21 27h18m-27 8h22m-29 8h25" stroke="#765b92" strokeLinecap="round"/></g> : null}
    {kind==="documents" ? <g transform="translate(82 12)" strokeLinejoin="round"><g transform="rotate(-7 55 45)"><rect x="15" y="8" width="92" height="76" rx="3" fill="#1c1729" stroke="#70528d"/><path d="M30 28h56M30 40h59M30 52h47M30 64h56" stroke="#6e5b84" strokeDasharray="2 3"/></g><g transform="rotate(6 66 50)"><rect x="31" y="18" width="92" height="76" rx="3" fill={fill} stroke={line} strokeWidth="1.5"/><path d="M46 38h56M46 50h59M46 62h47M46 74h56" stroke="#82b8eb" strokeDasharray="2 3"/><path d="M96 18v20h27" fill="#264d77" stroke={line}/></g></g>:null}
    {kind==="fonts" ? <g>
      <path d="M62 30h149M62 58h149M62 87h149" stroke="#594169" strokeDasharray="3 4"/><path d="M76 17v81M194 17v81" stroke="#493551"/>
      <text x="84" y="84" fontFamily="Georgia, 'Times New Roman', serif" fontSize="79" letterSpacing="-6" fill={line}>Aa</text>
      <g stroke="#77a9d7" fill="#211927"><rect x="73" y="28" width="5" height="5"/><rect x="192" y="28" width="5" height="5"/><rect x="73" y="85" width="5" height="5"/><rect x="192" y="85" width="5" height="5"/></g></g>:null}
    {kind==="assets" ? <g strokeLinejoin="round"><path d="m86 67 50-23 50 23-50 25z" fill="#251c38" stroke="#6f4f92"/><path d="m86 53 50-23 50 23-50 25z" fill="#33264a" stroke="#9570bc"/><path d="m86 39 50-23 50 23-50 25z" fill={fill} stroke={line} strokeWidth="1.5"/>
      <path d="m103 39 33-15 32 15-32 16z" stroke="#9b7eb4" strokeOpacity=".55"/><path d="m109 28 51 24m-35-32 50 25M100 46l49-23m-31 32 49-24" stroke="#bc9bea" strokeOpacity=".24"/><path d="M136 95v7" stroke="#70528d"/></g>:null}
    {kind==="audit" ? <g transform="translate(82 18)"><rect width="111" height="74" rx="6" fill="#211a2c" stroke={line}/><path d="M0 16h111" stroke="#594467"/><g fill="#9573af"><circle cx="9" cy="8" r="1.6"/><circle cx="15" cy="8" r="1.6"/><circle cx="21" cy="8" r="1.6"/></g><path d="M13 30h85M13 44h85M13 58h85" stroke="#45324e" strokeDasharray="2 3"/><path d="m12 55 16-1 12-13 13 8 13-16 12 7 20-18v42H12z" fill={fill}/><path d="m12 55 16-1 12-13 13 8 13-16 12 7 20-18" stroke={line} strokeWidth="2.4" strokeLinecap="round"/><circle cx="98" cy="22" r="3.5" fill="#b9e0ff"/></g>:null}
  </svg>;
}
