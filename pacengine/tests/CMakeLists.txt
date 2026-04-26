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
