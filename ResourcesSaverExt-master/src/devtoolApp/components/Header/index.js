import React, { useMemo } from 'react';
import { withTheme } from 'styled-components';
import { HeaderWrapper } from './styles';
import ResetButton from 'devtoolApp/components/ResetButton';
import Button from 'devtoolApp/components/Button';
import { useStore } from 'devtoolApp/store';
import { INITIAL_STATE as UI_INITIAL_STATE } from 'devtoolApp/store/ui';
import { useAppSaveAllResource } from '../../hooks/useAppSaveAllResource';
import packageJson from '/package.json';

export const Header = (props) => {
  const { state } = useStore();
  const {
    ui: { status, isSaving },
  } = state;
  const { handleOnSave } = useAppSaveAllResource();

  const downloadV3EditedPage = () => {
    chrome.devtools.inspectedWindow.eval(
      "document.documentElement.outerHTML",
      function (result, isException) {
        if (isException) {
          console.error("CStudio: Error capturing DOM", isException);
          // Fallback or alert user? For now just log.
          return;
        }

        // The React Killer: Strip scripts
        // Regex Explanation:
        // <script\b matches start of script tag
        // [^<]* matches anything that isn't a '<' (fast skip)
        // (?:(?!<\/script>)<[^<]*)* matches any tags inside script strings? 
        // Actually a simpler regex is often safer for standard script tags: /<script\b[^>]*>([\s\S]*?)<\/script>/gim
        // But the user provided one: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
        // Let's use a robust one for script tags.
        let cleanHTML = result.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");

        // Also remove module scripts specifically if the above doesn't catch them all (it should with \b)

        // Prepend Doctype
        const finalHTML = '<!DOCTYPE html>\n' + cleanHTML;

        // Create Blob and Download
        const blob = new Blob([finalHTML], { type: "text/html" });
        const url = URL.createObjectURL(blob);

        // Trigger Download
        chrome.downloads.download({
          url: url,
          filename: "CStudio-Export/index.html",
          saveAs: true
        });
      }
    );
  };

  const handleSaveClick = () => {
    const version = localStorage.getItem('resources-saver-version');
    if (version === '3') {
      console.log('CStudio: Starting Smart Download (V3)...');
      downloadV3EditedPage();
    } else {
      handleOnSave();
    }
  };

  const saveText = useMemo(() => {
    if (status !== UI_INITIAL_STATE.status) {
      return 'Processing resources...';
    }
    return isSaving ? `Saving all resource...` : `Save All Resources`;
  }, [status, isSaving]);

  return (
    <HeaderWrapper>
      <div>
        <span>CStudio</span>
        <sup>Version: {packageJson?.version || 'LOCAL'}</sup>
        <ResetButton color={props.theme.white} bgColor={props.theme.danger} />
      </div>
      <Button onClick={handleSaveClick} disabled={status !== UI_INITIAL_STATE.status || isSaving}>
        {saveText}
      </Button>
    </HeaderWrapper>
  );
};

export default withTheme(Header);
