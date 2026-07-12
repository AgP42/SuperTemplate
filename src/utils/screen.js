import {Dimensions, PixelRatio} from 'react-native';

/**
 * Screen size in raw PIXELS. Motion events and display-based SDK rects are
 * raw px while Dimensions is dp — ALWAYS multiply by PixelRatio (a
 * density-1 device has ratio 1, so the multiplication is a no-op there).
 */
export function screenPx() {
  const {width, height} = Dimensions.get('screen');
  const r = PixelRatio.get();
  return {width: width * r, height: height * r};
}
