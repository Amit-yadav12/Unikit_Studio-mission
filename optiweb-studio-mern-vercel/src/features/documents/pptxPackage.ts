import JSZip from "jszip";

import { MAX_DOCUMENT_ARCHIVE_BYTES } from "./documentLimits";

export type SlideRaster = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
};

const EMU_PER_POINT = 12_700;
const EMU_PER_INCH = 914_400;
const MAX_SLIDE_EMU = 13.333 * EMU_PER_INCH;

function groupShapeTree(): string {
  return `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Unikit Studio">
<a:themeElements>
<a:clrScheme name="Unikit"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="17233F"/></a:dk2><a:lt2><a:srgbClr val="F5F8FF"/></a:lt2><a:accent1><a:srgbClr val="1F65B4"/></a:accent1><a:accent2><a:srgbClr val="72B7FF"/></a:accent2><a:accent3><a:srgbClr val="FFF8AA"/></a:accent3><a:accent4><a:srgbClr val="745500"/></a:accent4><a:accent5><a:srgbClr val="6B5C94"/></a:accent5><a:accent6><a:srgbClr val="3B728F"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Unikit"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Unikit"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="95000"/><a:lumOff val="5000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="90000"/><a:lumOff val="10000"/></a:schemeClr></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="95000"/><a:lumOff val="5000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:lumMod val="90000"/><a:lumOff val="10000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

function imageSlideXml(index: number, boxWidth: number, boxHeight: number, slideWidth: number, slideHeight: number): string {
  const scale = Math.min(slideWidth / boxWidth, slideHeight / boxHeight);
  const width = Math.max(1, Math.round(boxWidth * scale));
  const height = Math.max(1, Math.round(boxHeight * scale));
  const left = Math.round((slideWidth - width) / 2);
  const top = Math.round((slideHeight - height) / 2);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${groupShapeTree()}<p:pic><p:nvPicPr><p:cNvPr id="2" name="PDF page ${index}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${left}" y="${top}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function slideRels(extension: string, index: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/page${index}.${extension}"/></Relationships>`;
}

export async function buildImageDeck(slides: readonly SlideRaster[], pageWidthPoints: number, pageHeightPoints: number, onProgress?: (completed: number, total: number) => void): Promise<Uint8Array> {
  if (slides.length < 1 || slides.length > 80) throw new Error("PDF-to-PowerPoint conversion supports 1–80 pages.");
  const widthPoints = Number.isFinite(pageWidthPoints) && pageWidthPoints > 0 ? pageWidthPoints : 612;
  const heightPoints = Number.isFinite(pageHeightPoints) && pageHeightPoints > 0 ? pageHeightPoints : 792;
  const sizeScale = Math.min(1, MAX_SLIDE_EMU / (widthPoints * EMU_PER_POINT), MAX_SLIDE_EMU / (heightPoints * EMU_PER_POINT));
  const slideWidth = Math.max(1, Math.round(widthPoints * EMU_PER_POINT * sizeScale));
  const slideHeight = Math.max(1, Math.round(heightPoints * EMU_PER_POINT * sizeScale));
  const zip = new JSZip();
  const contentTypes = new Set(slides.map((slide) => slide.mime === "image/jpeg" ? "jpg" : "png"));
  const defaults = [...contentTypes].map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === "jpg" ? "jpeg" : ext}"/>`).join("");
  const slideOverrides = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${defaults}<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`);
  zip.folder("_rels")!.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.folder("ppt")!.folder("_rels")!.file("presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`);
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${slideWidth}" cy="${slideHeight}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${groupShapeTree()}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.folder("ppt/slideMasters")!.folder("_rels")!.file("slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank">${groupShapeTree()}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.folder("ppt/slideLayouts")!.folder("_rels")!.file("slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.folder("ppt")!.folder("theme")!.file("theme1.xml", themeXml());
  const media = zip.folder("ppt")!.folder("media")!;
  const pptSlides = zip.folder("ppt")!.folder("slides")!;
  const relationships = pptSlides.folder("_rels")!;
  slides.forEach((slide, index) => {
    const extension = slide.mime === "image/jpeg" ? "jpg" : "png";
    media.file(`page${index + 1}.${extension}`, slide.bytes);
    pptSlides.file(`slide${index + 1}.xml`, imageSlideXml(index + 1, slide.width, slide.height, slideWidth, slideHeight));
    relationships.file(`slide${index + 1}.xml.rels`, slideRels(extension, index + 1));
    onProgress?.(index + 1, slides.length);
  });
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 }, streamFiles: true });
  if (bytes.byteLength > MAX_DOCUMENT_ARCHIVE_BYTES) throw new Error("The generated .pptx exceeds the 50 MB output safety limit.");
  return bytes;
}

export async function verifyImageDeck(bytes: Uint8Array, expectedSlides: number): Promise<void> {
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  const presentation = zip.file("ppt/presentation.xml");
  if (!presentation || !zip.file("[Content_Types].xml")) throw new Error("The generated PowerPoint did not pass package validation.");
  const xml = await presentation.async("string");
  const slides = (xml.match(/<p:sldId\b/g) ?? []).length;
  if (slides !== expectedSlides) throw new Error("The generated PowerPoint is missing one or more converted PDF pages.");
  for (let i = 1; i <= expectedSlides; i += 1) {
    if (!zip.file(`ppt/slides/slide${i}.xml`) || !zip.file(`ppt/slides/_rels/slide${i}.xml.rels`)) throw new Error(`The generated PowerPoint is missing slide ${i}.`);
  }
}

export function pointsToEmu(points: number): number { return Math.round(points * EMU_PER_POINT); }
