add_library(pacengine_runtime STATIC
    runtime/src/PacRuntime.cpp
    runtime/src/World.cpp
    runtime/src/EventLog.cpp
    runtime/db/src/LocalDatabase.cpp
    runtime/worker/src/LocalWorker.cpp
    conflict_sim/src/ConflictSim.cpp
    scheduler/src/Scheduler.cpp
    trace/src/Trace.cpp
)

target_include_directories(pacengine_runtime
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/runtime/include
        ${CMAKE_CURRENT_SOURCE_DIR}/runtime/db/include
        ${CMAKE_CURRENT_SOURCE_DIR}/runtime/worker/include
        ${CMAKE_CURRENT_SOURCE_DIR}/conflict_sim/include
        ${CMAKE_CURRENT_SOURCE_DIR}/trace/include
        ${CMAKE_CURRENT_SOURCE_DIR}/ecs/include
        ${CMAKE_CURRENT_SOURCE_DIR}/scheduler/include
)

target_link_libraries(pacengine_runtime
    PUBLIC
        pacengine::pacdata
)

set_target_properties(pacengine_runtime PROPERTIES
    POSITION_INDEPENDENT_CODE ON
)

add_library(pacengine::runtime ALIAS pacengine_runtime)
