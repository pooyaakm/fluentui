import * as React from 'react';
import { slot, useMergedRefs } from '@fluentui/react-utilities';
import { useVirtualizer_unstable } from '../Virtualizer/useVirtualizer';
import type {
  VirtualizerScrollViewDynamicProps,
  VirtualizerScrollViewDynamicState,
} from './VirtualizerScrollViewDynamic.types';
import { useDynamicVirtualizerMeasure } from '../../Hooks';
import { useVirtualizerContextState_unstable, scrollToItemDynamic } from '../../Utilities';
import type { VirtualizerDataRef } from '../Virtualizer/Virtualizer.types';
import { useImperativeHandle } from 'react';
import { useMeasureList } from '../../hooks/useMeasureList';
import type { IndexedResizeCallbackElement } from '../../hooks/useMeasureList';

export function useVirtualizerScrollViewDynamic_unstable(
  props: VirtualizerScrollViewDynamicProps,
): VirtualizerScrollViewDynamicState {
  const contextState = useVirtualizerContextState_unstable(props.virtualizerContext);
  const { imperativeRef, axis = 'vertical', reversed, imperativeVirtualizerRef } = props;

  let sizeTrackingArray = React.useRef<number[]>(new Array(props.numItems).fill(props.itemSize));

  const getChildSizeAuto = React.useCallback(
    (index: number) => {
      if (sizeTrackingArray.current.length <= index || sizeTrackingArray.current[index] <= 0) {
        // Default size for initial state or untracked
        return props.itemSize;
      }
      /* Required to be defined prior to our measure function
       * we use a sizing array ref that we will update post-render
       */
      return sizeTrackingArray.current[index];
    },
    [sizeTrackingArray, props.itemSize],
  );

  const { virtualizerLength, bufferItems, bufferSize, scrollRef } = useDynamicVirtualizerMeasure({
    defaultItemSize: props.itemSize,
    direction: props.axis ?? 'vertical',
    getItemSize: props.getItemSize ?? getChildSizeAuto,
    currentIndex: contextState?.contextIndex ?? 0,
    numItems: props.numItems,
  });

  // Store the virtualizer length as a ref for imperative ref access
  const virtualizerLengthRef = React.useRef<number>(virtualizerLength);
  if (virtualizerLengthRef.current !== virtualizerLength) {
    virtualizerLengthRef.current = virtualizerLength;
  }
  const scrollViewRef = useMergedRefs(props.scrollViewRef, scrollRef) as React.RefObject<HTMLDivElement>;
  const scrollCallbackRef = React.useRef<null | ((index: number) => void)>(null);

  const _imperativeVirtualizerRef = useMergedRefs(React.useRef<VirtualizerDataRef>(null), imperativeVirtualizerRef);

  useImperativeHandle(
    imperativeRef,
    () => {
      return {
        scrollTo(index: number, behavior = 'auto', callback: undefined | ((index: number) => void)) {
          scrollCallbackRef.current = callback ?? null;
          if (_imperativeVirtualizerRef.current) {
            const progressiveSizes = _imperativeVirtualizerRef.current.progressiveSizes.current;
            const totalSize =
              progressiveSizes && progressiveSizes?.length > 0
                ? progressiveSizes[Math.max(progressiveSizes.length - 1, 0)]
                : 0;

            _imperativeVirtualizerRef.current.setFlaggedIndex(index);
            scrollToItemDynamic({
              index,
              itemSizes: _imperativeVirtualizerRef.current?.nodeSizes,
              totalSize,
              scrollViewRef,
              axis,
              reversed,
              behavior,
            });
          }
        },
        currentIndex: _imperativeVirtualizerRef.current?.currentIndex,
        virtualizerLength: virtualizerLengthRef,
      };
    },
    [axis, scrollViewRef, reversed, _imperativeVirtualizerRef],
  );

  const handleRenderedIndex = (index: number) => {
    if (scrollCallbackRef.current) {
      scrollCallbackRef.current(index);
    }
  };

  const virtualizerState = useVirtualizer_unstable({
    ...props,
    getItemSize: props.getItemSize ?? getChildSizeAuto,
    virtualizerLength,
    bufferItems,
    bufferSize,
    scrollViewRef,
    virtualizerContext: contextState,
    imperativeVirtualizerRef: _imperativeVirtualizerRef,
    onRenderedFlaggedIndex: handleRenderedIndex,
  });

  const measureObject = useMeasureList(
    virtualizerState.virtualizerStartIndex,
    virtualizerLength,
    props.numItems,
    props.itemSize,
  );

  if (axis === 'horizontal') {
    sizeTrackingArray = measureObject.widthArray;
  } else {
    sizeTrackingArray = measureObject.heightArray;
  }

  if (!props.getItemSize) {
    // Auto-measuring is required
    React.Children.map(virtualizerState.virtualizedChildren, (child, index) => {
      if (React.isValidElement(child)) {
        virtualizerState.virtualizedChildren[index] = (
          <child.type
            {...child.props}
            key={child.key}
            ref={(element: HTMLElement & IndexedResizeCallbackElement) => {
              // If a ref exists in props, call it
              if (typeof child.props.ref === 'function') {
                child.props.ref(element);
              } else if (child.props.ref) {
                child.props.ref.current = element;
              }

              if (child.hasOwnProperty('ref')) {
                // We must access this from the child directly, not props (forward ref).
                // eslint-disable-next-line  @typescript-eslint/no-explicit-any
                const localRef = (child as any)?.ref;

                if (typeof localRef === 'function') {
                  localRef(element);
                } else if (localRef) {
                  localRef.current = element;
                }
              }

              // Call the auto-measure ref attachment.
              measureObject.createIndexedRef(index)(element);
            }}
          />
        );
      }
    });
  }

  return {
    ...virtualizerState,
    components: {
      ...virtualizerState.components,
      container: 'div',
    },
    container: slot.always(props.container, {
      defaultProps: {
        ref: scrollViewRef,
      },
      elementType: 'div',
    }),
  };
}
