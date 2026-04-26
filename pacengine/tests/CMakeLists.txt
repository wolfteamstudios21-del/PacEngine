add_executable(test_determinism test_determinism.cpp)
target_link_libraries(test_determinism
    PRIVATE
        pacengine::runtime
        pacengine::pacdata
)
add_test(
    NAME    determinism
    COMMAND test_determinism
)

add_executable(test_ecs test_ecs.cpp)
target_link_libraries(test_ecs
    PRIVATE
        pacengine::runtime
        pacengine::pacdata
)
add_test(
    NAME    ecs
    COMMAND test_ecs
)

add_executable(test_agent_demo test_agent_demo.cpp)
target_link_libraries(test_agent_demo
    PRIVATE
        pacengine::runtime
        pacengine::pacdata
)
add_test(
    NAME                test_agent_demo
    COMMAND             test_agent_demo
    WORKING_DIRECTORY   ${CMAKE_SOURCE_DIR}
)

add_executable(test_worker_isolation test_worker_isolation.cpp)
target_link_libraries(test_worker_isolation
    PRIVATE
        pacengine::runtime
        pacengine::pacdata
)
add_test(
    NAME                test_worker_isolation
    COMMAND             test_worker_isolation
    WORKING_DIRECTORY   ${CMAKE_SOURCE_DIR}
)
