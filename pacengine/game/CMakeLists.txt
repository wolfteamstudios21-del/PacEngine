add_executable(pacengine_game main.cpp)

target_link_libraries(pacengine_game
    PRIVATE
        pacengine::runtime
        pacengine::pacdata
)

set_target_properties(pacengine_game PROPERTIES
    OUTPUT_NAME "pacengine_game"
)
