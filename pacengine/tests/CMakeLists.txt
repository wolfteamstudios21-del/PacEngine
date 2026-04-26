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
