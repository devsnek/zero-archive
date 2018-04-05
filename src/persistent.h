#ifndef SRC_PERSISTENT_H_
#define SRC_PERSISTENT_H_

#include "v8.h"

namespace ivan {

template <typename T>
struct ResetInDestructorPersistentTraits {
  static const bool kResetInDestructor = true;
  template <typename S, typename M>
  // Disallow copy semantics by leaving this unimplemented.
  inline static void Copy(
      const v8::Persistent<S, M>&,
      v8::Persistent<T, ResetInDestructorPersistentTraits<T>>*);
};

// v8::Persistent does not reset the object slot in its destructor.  That is
// acknowledged as a flaw in the V8 API and expected to change in the future
// but for now node::Persistent is the easier and safer alternative.
template <typename T>
using Persistent = v8::Persistent<T, ResetInDestructorPersistentTraits<T>>;

}  // namespace ivan

#endif  // SRC_PERSISTENT_H_
