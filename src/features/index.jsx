import TemplateLibrary from './TemplateLibrary'
import OnboardingTour from './OnboardingTour'
import SmartArrange from './SmartArrange'
import AnnotationSummary from './AnnotationSummary'
import VersionHistory from './VersionHistory'
import MinimapFeature from './MinimapFeature'
import OcrTool from './OcrTool'
import PasteToImage from './PasteToImage'

// Mounts all opt-in canvas features inside the <Tldraw> context.
export default function CowartFeatures() {
  return (
    <>
      <PasteToImage />
      <TemplateLibrary />
      <OnboardingTour />
      <SmartArrange />
      <AnnotationSummary />
      <VersionHistory />
      <MinimapFeature />
      <OcrTool />
    </>
  )
}
