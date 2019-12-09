import { useEffect, useRef } from 'react';
const { remote } = window.require('electron');
const { Menu, MenuItem } = remote;

const useContextMenu = (itemArr, targetSelector, files) => {
  let clickedElement = useRef(null);

  const handleContextMenu = (e) => {
    // only show the context menu that targetSelector contains dom
    if (document.querySelector(targetSelector).contains(e.target)) {
      clickedElement.current = e.target; // this change will render pComponent
      menu.popup({ window: remote.getCurrentWindow() });
    }
  };

  const menu = new Menu();
  itemArr.forEach(item => {
    menu.append(new MenuItem(item))
  });
  
  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [files]);

  return clickedElement;
};

export default useContextMenu;