(() => {
  const diagram = document.querySelector('.core-diagram');
  if (!diagram) return;
  const svg = diagram.querySelector('.core-connectors');
  const stages = [...diagram.querySelectorAll('.core-step')];
  function drawConnections() {
    const bounds = diagram.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    const boxes = stages.map(stage => stage.getBoundingClientRect());
    svg.replaceChildren();
    const anchors = boxes.map((box, index) => ({
      x: box.left + box.width / 2 - bounds.left,
      bottom: box.bottom - bounds.top + 4,
      top: stages[index].querySelector('.core-step-number').getBoundingClientRect().top - bounds.top - 4
    }));
    function addPath(data) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', data);
      svg.append(path);
    }
    // Each branching row shares one horizontal rail, without overlapping curves.
    function connectRow(sourceIndexes, targetIndexes) {
      const sources = sourceIndexes.map(index => anchors[index]);
      const targets = targetIndexes.map(index => anchors[index]);
      const sourceY = Math.max(...sources.map(point => point.bottom));
      const targetY = Math.min(...targets.map(point => point.top));
      const railY = (sourceY + targetY) / 2;
      const left = targets[0], right = targets[targets.length - 1];
      const radius = Math.max(0, Math.min(5, (targetY - sourceY) / 4));
      addPath(`M${left.x},${left.top} V${railY + radius} Q${left.x},${railY} ${left.x + radius},${railY} H${right.x - radius} Q${right.x},${railY} ${right.x},${railY + radius} V${right.top}`);
      sources.forEach(point => addPath(`M${point.x},${point.bottom} V${railY}`));
      targets.slice(1, -1).forEach(point => addPath(`M${point.x},${railY} V${point.top}`));
    }
    connectRow([0], [1, 2]);
    connectRow([1, 2], [3, 4, 5]);
    [3, 4, 5].forEach(index => {
      const source = anchors[index], target = anchors[index + 3];
      addPath(`M${source.x},${source.bottom} V${target.top}`);
    });
  }
  new ResizeObserver(drawConnections).observe(diagram);
  document.fonts.ready.then(drawConnections);
  const dialog=document.querySelector('.core-stage-dialog');
  stages.forEach((stage,index) => {
    stage.querySelector('button').addEventListener('click',() => {
      dialog.querySelector('#core-dialog-number').textContent=`STAGE ${String(index+1).padStart(2,'0')} / 09`;
      dialog.querySelector('#core-dialog-title').textContent=stage.querySelector('h3').textContent;
      dialog.querySelector('#core-dialog-description').textContent=stage.querySelector('article p').textContent;
      dialog.showModal();
    });
  });
  dialog.querySelector('.core-dialog-close').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',event => {
    if(event.target!==dialog) return;
    const box=dialog.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom) dialog.close();
  });
})();
