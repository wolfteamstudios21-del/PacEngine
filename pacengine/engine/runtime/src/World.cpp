#include "World.hpp"

namespace pac {

World::World(const PacData& data)
    : name_(data.world.name) {
    // Future milestones: build ECS storage from data.world.entities,
    // register GMs from data.world.gms, allocate shards from
    // data.world.shards. Intentionally left minimal for the scaffold.
}

} // namespace pac
