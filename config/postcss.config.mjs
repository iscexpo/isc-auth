import autoprefixer from 'autoprefixer'
import postcssNested from 'postcss-nested'
import cssnano from 'cssnano'

export default {
  plugins: [
    autoprefixer,
    postcssNested,
    cssnano({ preset: 'default' })
  ]
}
